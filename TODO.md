# Implementation Plan - Progress Tracker

## Part 1: Remove per-item "Rate" button & Add Rate button in Order History for completed orders
- [x] Plan confirmed with user
- [x] Remove "Rate" button from `renderMenu()` in script.js - DONE
- [x] Add "Rate Item" button in `updateOrderHistoryPage()` for COMPLETED orders - DONE

## Part 2: Add "Slot" (Lunch/Evening) field to MenuItem
- [x] Update `schema.sql` - add `slot` column - DONE
- [x] Update `MenuItem.java` - add `slot` field (String with default "BOTH") - DONE
- [x] Update `MenuItemController.java` - handle slot in create/update - DONE
- [x] Update `DataSeeder.java` - assign slots to seeded items - DONE
- [x] Update `admin.html` - add slot dropdown to Add/Edit Item modals - DONE
- [x] Update `script.js`:
  - [x] Include slot in `loadMenuItems()` mapping - DONE
  - [x] Sort items in `renderMenu()` based on current session (slot-based sorting) - DONE
  - [x] Show slot badge on each item card - DONE
  - [x] Include slot in add/edit item form handlers - DONE
  - [x] Show slot in admin menu items list - DONE

## Part 3: Stock quantity already 50 (verified in DataSeeder)
- [x] Already implemented - all items seeded with stockQuantity=50
- [x] Set default stock to 50 in controller for new items - DONE

## All tasks completed! ✅

