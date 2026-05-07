/**
 * Hidden tab slot that sits in the middle of the tab bar so the floating
 * pin FAB has clearance from the labels on either side.
 *
 * Never navigated to — `tabBarButton` returns an empty View and pressing
 * the FAB calls router.push('/pin/search') directly. This file only
 * exists so expo-router has a route to attach the slot to.
 */
export default function PinSpacer() {
  return null;
}
