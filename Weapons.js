////////////// WEAPONS

GetTimeToUpgradeWeapon = function (formula, currentLevel) {
    var level = parseInt(currentLevel);
    var a = Math.pow(level + 1, 2);
    var b = Math.pow(level, 2);
    var result = (a - b) * 1000;
    return result; //assuming (level+1)^2 - level^2 formula
}

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

function GetItem(ItemInstanceId) {
    var inventory = server.GetUserInventory({ PlayFabId: currentPlayerId }).Inventory;
    var item = undefined;

    for (var i = 0; i < inventory.length; i++) {
        if (inventory[i].ItemInstanceId == ItemInstanceId) {
            item = inventory[i];
        }
    }
    return item;
}
//HI
/** 
 * @returns Null if weapon is not in player's inventory or it's not upgrading, -1 if the weapon was successfully ugraded and number (remainingTime) if upgrade is in progress.
 */
handlers.UpdateWeaponUpgrade = function (args) {
    //Consider that players could pay to directly upgrade the weapons without needing to wait.

    //Prevent cheating...
    var startUpgrade = args.startUpgrade; //Start upgrading if it's not currently doing so?
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
        if (startUpgrade) {
            upgradeTimeStamp = Date.now();
            server.UpdateUserInventoryItemCustomData({ PlayFabId: currentPlayerId, ItemInstanceId: weaponInstanceId, Data: { UpgradeTimeStamp: upgradeTimeStamp } });
            isCurrentlyUpdating = true;
        }
    }

    if (isCurrentlyUpdating) {
        var timeToUpgradeWeapon = GetTimeToUpgradeWeapon(null, weapon.CustomData.Level)

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

    var currency = server.GetUserInventory({ PlayFabId: currentPlayerId }).VirtualCurrency["TK"];

    var upgradeCost = 1;

    if (currency >= upgradeCost) {
        UpgradeWeapon(args.weaponInstanceId, currentPlayerId);
        server.SubtractUserVirtualCurrency({ Amount: upgradeCost, PlayFabId: currentPlayerId, VirtualCurrency: "TK" });
        log.debug("Weapon upgraded successfully");
        return 1;
    } else {
        log.debug("User has not enough currency");
        return -1;
    }
}

handlers.UpgradeWeaponUsingMaterials = function (args) {
    var weapon = GetItem(args.weaponInstanceId);

    if (weapon == null || weapon === undefined) {
        log.debug("Weapon is not in player's inventory");
        return 0;
    }

    var inventoryResult = server.GetUserInventory({ PlayFabId: currentPlayerId });

    const CURRENCY_ID = "QS";
    var currency = inventoryResult.VirtualCurrency[CURRENCY_ID];
    var inventory = inventoryResult.Inventory;

    var materialCount = 0;
    var materialInstanceId = "";
    const MATERIAL_ID = "YELLOW_ROCK";

    for (let i = 0; i < inventory.length; i++) {
        var item = inventory[i];
        if (item.ItemId == MATERIAL_ID) {
            materialCount = item.RemainingUses;
            materialInstanceId = item.ItemInstanceId;
            break;
        }
    }

    var currencyCost = 1;
    var materialCost = 1;

    if (materialCount < materialCost) {
        log.debug("Player has not enough material " + MATERIAL_ID);
        return -2;
    }
    if (currency < currencyCost) {
        log.debug("User has not enough currency");
        return -1;
    }

    UpgradeWeapon(args.weaponInstanceId, currentPlayerId);
    server.SubtractUserVirtualCurrency({ Amount: currencyCost, PlayFabId: currentPlayerId, VirtualCurrency: CURRENCY_ID });
    server.ConsumeItem({ ConsumeCount: materialCost, ItemInstanceId: materialInstanceId, PlayFabId: currentPlayerId });
    log.debug("Weapon upgraded successfully");
    return 1;
}

