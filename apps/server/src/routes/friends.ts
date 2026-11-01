import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import {
  friendRequestBodySchema,
  type Friend,
  type UserSearchResult,
} from '@app/shared';
import { friendships, isDuplicateKeyError, users, type FriendshipDoc } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { isOnline } from '../lib/presence.js';

function parseUserId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) throw AppError.notFound('Account not found');
  return new ObjectId(value);
}

function toFriend(doc: FriendshipDoc, viewer: ObjectId, displayName: string): Friend {
  const outgoing = doc.requesterId.equals(viewer);
  const otherId = (outgoing ? doc.addresseeId : doc.requesterId).toHexString();

  return {
    userId: otherId,
    displayName,
    status: doc.status,
    outgoing,
    online: isOnline(otherId),
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function friendRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  app.get('/', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();
    const viewer = new ObjectId(claim);

    const docs = await friendships()
      .find({
        $or: [{ requesterId: viewer }, { addresseeId: viewer }],
        status: { $ne: 'blocked' },
      })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    const otherIds = docs.map((doc) =>
      doc.requesterId.equals(viewer) ? doc.addresseeId : doc.requesterId,
    );
    const people = await users()
      .find({ _id: { $in: otherIds } }, { projection: { displayName: 1 } })
      .toArray();
    const names = new Map(people.map((person) => [person._id.toHexString(), person.displayName]));

    const items = docs.map((doc) => {
      const other = doc.requesterId.equals(viewer) ? doc.addresseeId : doc.requesterId;
      return toFriend(doc, viewer, names.get(other.toHexString()) ?? 'Unknown');
    });

    return { ok: true as const, data: { items } };
  });

  /**
   * Sends a request, or accepts one already waiting from that person.
   *
   * Two people adding each other mean the same thing, so the second request
   * completes the friendship rather than leaving two pending rows.
   */
  app.post('/', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();
    const viewer = new ObjectId(claim);

    const body = friendRequestBodySchema.parse(request.body);
    const other = parseUserId(body.userId);
    if (other.equals(viewer)) throw AppError.badRequest('You cannot add yourself');

    const person = await users().findOne(
      { _id: other, isBot: { $ne: true } },
      { projection: { displayName: 1 } },
    );
    if (!person) throw AppError.notFound('Account not found');

    const accepted = await friendships().findOneAndUpdate(
      { requesterId: other, addresseeId: viewer, status: 'pending' },
      { $set: { status: 'accepted', updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (accepted) {
      return { ok: true as const, data: toFriend(accepted, viewer, person.displayName) };
    }

    // Asked already in the other direction and settled: nothing new to send.
    const reverse = await friendships().countDocuments({ requesterId: other, addresseeId: viewer });
    if (reverse > 0) throw AppError.conflict('You are already connected with this player');

    const doc: FriendshipDoc = {
      _id: new ObjectId(),
      requesterId: viewer,
      addresseeId: other,
      status: 'pending',
      createdAt: new Date(),
    };

    try {
      await friendships().insertOne(doc);
    } catch (error) {
      if (isDuplicateKeyError(error)) throw AppError.conflict('Request already sent');
      throw error;
    }

    return { ok: true as const, data: toFriend(doc, viewer, person.displayName) };
  });

  app.post('/:userId/accept', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();
    const viewer = new ObjectId(claim);

    const { userId } = request.params as { userId: string };
    const other = parseUserId(userId);

    // Only the person the request was sent to may accept it, and the filter
    // says so: the sender cannot accept on their own behalf.
    const updated = await friendships().updateOne(
      { requesterId: other, addresseeId: viewer, status: 'pending' },
      { $set: { status: 'accepted', updatedAt: new Date() } },
    );
    if (updated.modifiedCount !== 1) throw AppError.notFound('No request from this player');

    return { ok: true as const, data: { accepted: true } };
  });

  /** Unfriends, declines, or cancels: all the same row going away. */
  app.delete('/:userId', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();
    const viewer = new ObjectId(claim);

    const { userId } = request.params as { userId: string };
    const other = parseUserId(userId);

    await friendships().deleteMany({
      $or: [
        { requesterId: viewer, addresseeId: other },
        { requesterId: other, addresseeId: viewer },
      ],
      status: { $ne: 'blocked' },
    });

    return { ok: true as const, data: { removed: true } };
  });
}

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  /** Finds people by display name. Email is never searched or returned. */
  app.get('/search', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const query = ((request.query as { q?: string }).q ?? '').trim();
    if (query.length < 2) return { ok: true as const, data: { items: [] } };

    const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const docs = await users()
      .find(
        {
          displayName: { $regex: pattern, $options: 'i' },
          isBot: { $ne: true },
          _id: { $ne: new ObjectId(claim) },
        },
        { projection: { displayName: 1 } },
      )
      .limit(20)
      .toArray();

    const items: UserSearchResult[] = docs.map((doc) => ({
      userId: doc._id.toHexString(),
      displayName: doc.displayName,
    }));

    return { ok: true as const, data: { items } };
  });
}
