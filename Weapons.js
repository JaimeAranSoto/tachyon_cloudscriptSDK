////////////// WEAPONS

UpgradeWeapon = function (weaponInstanceId, currentPlayerId) {
    var inventory = server.GetUserInventory({ PlayFabId: currentPlayerId }).Inventory;
    var weaponLevel;


    for (var i = 0; i < inventory.length; i++) {
        if (inventory[i].ItemInstanceId == weaponInstanceId) {
            weaponLevel = inventory[i].CustomData.Level;
        }
    }
    if (weaponLevel == null) {
        weaponLevel = 1;
    }
    weaponLevel++;
    log.debug("Level up!", weaponLevel);
    server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: weaponInstanceId, Data: { Level: weaponLevel, UpgradeTimeStamp: -1 } });
}

GetItem = function (ItemInstanceId) {
    var inventory = server.GetUserInventory({ PlayFabId: currentPlayerId }).Inventory;
    var item = undefined;

    for (var i = 0; i < inventory.length; i++) {
        if (inventory[i].ItemInstanceId == ItemInstanceId) {
            item = inventory[i];
        }
    }
    return item;
}
/** 
 * @returns Null if weapon is not in player's inventory or it's not upgrading, -1 if the weapon was successfully ugraded and number (remainingTime) if upgrade is in progress.
 */
handlers.UpdateWeaponUpgrade = function (args) {
    //var startUpgrade = args.startUpgrade; //Start upgrading if it's not currently doing so?
    var weaponInstanceId = args.weaponInstanceId;

    var weapon = GetItem(weaponInstanceId);

    if (weapon === undefined || weapon == null) {
        log.debug("Weapon is not in player's inventory");
        return null;
    }

    if (weapon.CustomData === undefined || Object.keys(weapon.CustomData).length === 0) { //Fill CustomData if it's empty.
        server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: weaponInstanceId, Data: { Level: 1 } });
    }

    var isCurrentlyUpdating = weapon.CustomData.UpgradeTimeStamp !== undefined && weapon.CustomData.UpgradeTimeStamp != -1;
    var upgradeTimeStamp = null; //Default if it's not currently upgrading

    if (isCurrentlyUpdating) {
        upgradeTimeStamp = parseInt(weapon.CustomData.UpgradeTimeStamp);
    } else {
        /*if (startUpgrade) {*/
        upgradeTimeStamp = Date.now();
        server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: weaponInstanceId, Data: { UpgradeTimeStamp: upgradeTimeStamp } });
        isCurrentlyUpdating = true;
        /*}*/
    }

    if (isCurrentlyUpdating) {

        var json = server.GetTitleData({ Keys: ["upgradeCost"] }).Data.upgradeCost;
        var cost = JSON.parse(json);

        var timeToUpgradeWeapon = cost[weapon.CustomData.Level].time * 60000; //minutes -> milliseconds

        log.debug("Time needed to upgrade the weapon", timeToUpgradeWeapon);
        log.debug("Time that has passed since upgrade start", Date.now() - upgradeTimeStamp);

        if (Date.now() - upgradeTimeStamp >= timeToUpgradeWeapon) {
            UpgradeWeapon(weaponInstanceId, currentPlayerId);
            server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: weaponInstanceId, Data: { UpgradeTimeStamp: -1 } });

        }

        var timeRemaining = timeToUpgradeWeapon - (Date.now() - upgradeTimeStamp);
        if (timeRemaining < 0) timeRemaining = -1;
        return timeRemaining;
    } else {
        return null;
    }
}

handlers.UpgradeWeaponUsingCurrency = function (args) {
    var weapon = GetItem(args.weaponInstanceId);

    if (weapon == null || weapon === undefined) {
        log.debug("Weapon is not in player's inventory");
        return 0;
    }

    var inventoryResult = server.GetUserInventory({ PlayFabId: currentPlayerId });

    const QUASAR = "QS";
    const YELLOW_ROCKS = "YR";
    var quasar = inventoryResult.VirtualCurrency[QUASAR];
    var rocks = inventoryResult.VirtualCurrency[YELLOW_ROCKS];

    var json = server.GetTitleData({ Keys: ["upgradeCost"] }).Data.upgradeCost;
    var cost = JSON.parse(json);

    var quasarCost = cost[weapon.CustomData.Level].quasar;
    log.debug("Quasar cost: " + quasarCost);
    var rocksCost = cost[weapon.CustomData.Level].rocks;
    log.debug("Rocks cost: " + rocksCost);

    if (quasar < quasarCost) {
        log.debug("User has not enough Quasar");
        return -2;
    }
    if (rocks < rocksCost) {
        log.debug("User has not enough Rocks");
        return -1;
    }

    UpgradeWeapon(args.weaponInstanceId, currentPlayerId);
    server.SubtractUserVirtualCurrency({ Amount: quasarCost, PlayFabId: currentPlayerId, VirtualCurrency: QUASAR });
    server.SubtractUserVirtualCurrency({ Amount: rocksCost, PlayFabId: currentPlayerId, VirtualCurrency: YELLOW_ROCKS });
    log.debug("Weapon upgraded successfully");
    return 1;
}