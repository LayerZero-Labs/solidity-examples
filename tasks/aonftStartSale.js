module.exports = async function (taskArgs, hre) {
    const advancedONFT = await ethers.getContract("AdvancedONFT721")
    console.log(`[source] AdvancedONFT721.address: ${advancedONFT.address}`)

    // flip both public and private sales
    try {
        let tx1 = await (await advancedONFT.flipSaleStarted()).wait()
        console.log(`✅ [${hre.network.name}] flipSaleStarted()`)
        console.log(` tx1: ${tx1.transactionHash}`)
        let tx2 = await (await advancedONFT.flipPublicSaleStarted()).wait()
        console.log(`✅ [${hre.network.name}] flipPublicSaleStarted()`)
        console.log(` tx2: ${tx2.transactionHash}`)
    } catch (e) {
        console.log(e)
    }
}
