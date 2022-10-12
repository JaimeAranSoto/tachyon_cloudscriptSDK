////////////// BLOCKCHAIN

handlers.PurchaseItem = function (args) {
    var purchases = args.purchases;
    /* EXAMPLE:
    "purchases": [
        {
            "purchaseId": 1,
            "tokenAmount": 247.00000000,
            "gemAmount": 80.00000000,
            "packId": 1,
            "type": "ON_CHAIN",
            "transactionHash": "0x8e34e52401b29cf09da424429591ae3321d3cb54ade858e80b992f447fac684e"
        },
        {
            "purchaseId": 2,
            "tokenAmount": 247.00000000,
            "gemAmount": 80.00000000,
            "packId": 1,
            "type": "ON_CHAIN",
            "transactionHash": "0x8e34e52401b29cf09da424429591ae3321d3cb54ade858e80b992f447fac684e"
        }
    ]
    */
    var internalData = server.GetUserInternalData({ PlayFabId: currentPlayerId, Keys: ["purchases"] });

    if (internalData.Data.purchases != null) {
        var internalData = JSON.parse(internalData.Data.purchases.Value);
    } else {
        var internalData = [];
    }

    var response = [];

    purchasesLoop: for (let i = 0; i < purchases.length; i++) {
        const purchase = purchases[i];
        var newPurchaseId = purchase.purchaseId;

        for (let j = 0; j < internalData.length; j++) {
            const storedPurchase = internalData[j];
            if (storedPurchase.purchaseId == newPurchaseId) {
                response.push({ purchaseId: newPurchaseId, status: "already_confirmed" });
                continue purchasesLoop;
            }
        }

        var tokenAmount = purchase.tokenAmount;
        var gemAmount = purchase.gemAmount;
        var packId = purchase.packId;
        var type = purchase.type;
        var transactionHash = purchase.transactionHash;
        response.push({ purchaseId: newPurchaseId, status: "confirmed" });

        internalData.push(purchase);

        server.UpdateUserInternalData({
            PlayFabId: currentPlayerId, Data: {
                "purchases": JSON.stringify(internalData);
            }
        })
    }

    return response;
}