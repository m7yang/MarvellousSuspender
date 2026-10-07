export async function shouldSkipAutomaticSuspension(
  tab,
  forceLevel,
  getWindowById,
) {
  if (!(forceLevel >= 3) || typeof tab?.windowId !== 'number') {
    return false;
  }

  const tabWindow = await getWindowById(tab.windowId);
  // Upstream owns app-window protection, including its setting and Always Suspend override.
  return tabWindow?.type === 'popup';
}
