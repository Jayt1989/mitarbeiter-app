"use client";

export function refreshNotifications() {
  window.dispatchEvent(new Event("notifications:refresh"));
}
