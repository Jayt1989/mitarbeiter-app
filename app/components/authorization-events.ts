export const authorizationChangedEvent = "authorization:changed";

export function refreshAuthorization() {
  window.dispatchEvent(new Event(authorizationChangedEvent));
  const channel = new BroadcastChannel(authorizationChangedEvent);
  channel.postMessage("refresh");
  channel.close();
}
