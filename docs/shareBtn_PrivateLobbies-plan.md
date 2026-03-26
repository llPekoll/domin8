## Plan: Share Button & Private Lobbies for 1v1 Lobbies

Add lobby sharing via URL with privacy-focused token (8-char random UUID) and private lobby creation that hides lobbies from the public list while remaining joinable via direct link.

### Steps

1. **Add `isPrivate` and `shareToken` fields to schema** in the database schema — Add `isPrivate` (optional boolean) and `shareToken` (string) to `oneVOneLobbies` table; add index `by_shareToken: ["shareToken"]` for fast URL lookup.

2. **Update server lobby mutations and queries** in the lobbies module:
   - Add `isPrivate` parameter to `createLobby` action args
   - Generate `shareToken` via `crypto.randomUUID().slice(0, 8)` in `createLobbyInDb` and `_internalCreateLobby`
   - Update `getOpenLobbies` query to filter out private lobbies: add `.filter((q) => q.neq(q.field("isPrivate"), true))`
   - Add new query `getLobbyByShareToken` with args `{ shareToken: v.string() }` returning the matching lobby

3. **Update `LobbyData` interface across components** — Add `isPrivate?: boolean` and `shareToken: string` to the `LobbyData` interface in [`LobbyList.tsx`](d:\Dev\royalrumble\src\components\onevone\LobbyList.tsx), [`LobbyDetailsDialog.tsx`](d:\Dev\royalrumble\src\components\onevone\LobbyDetailsDialog.tsx), [`OneVOneArenaModal.tsx`](d:\Dev\royalrumble\src\components\onevone\OneVOneArenaModal.tsx), and [`OneVOnePage.tsx`](d:\Dev\royalrumble\src\pages\OneVOnePage.tsx).

4. **Add private lobby toggle** in [`CreateLobby.tsx`](d:\Dev\royalrumble\src\components\onevone\CreateLobby.tsx) — Add a checkbox below bet amount with label "🔒 Private Lobby" and helper text "(Only joinable via share link)"; add `isPrivate` state and pass it to `createLobbyAction`.

5. **Add share button to LobbyDetailsDialog** in [`LobbyDetailsDialog.tsx`](d:\Dev\royalrumble\src\components\onevone\LobbyDetailsDialog.tsx) — Add a share/copy icon button in the header next to lobby title; on click, copy `${window.location.origin}/1v1?join=${lobby.shareToken}` to clipboard; show `toast.success("Link copied!")`.

6. **Add inline share icons in LobbyList** in [`LobbyList.tsx`](d:\Dev\royalrumble\src\components\onevone\LobbyList.tsx) — Add a small share icon button in each lobby row (next to action button); clicking copies share URL; show 🔒 lock icon badge on private lobbies in "My Lobbies" tab.

7. **Handle URL parameter on page load** in [`OneVOnePage.tsx`](d:\Dev\royalrumble\src\pages\OneVOnePage.tsx) — Import `useSearchParams` from react-router-dom; on mount, read `join` param; if present, use `useQuery(api.lobbies.getLobbyByShareToken, { shareToken })` to fetch lobby; if found with status=0, set it as `selectedLobby` and open `LobbyDetailsDialog`.
