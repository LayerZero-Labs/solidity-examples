module.exports = async function (taskArgs, hre) {
    const advancedONFT = await ethers.getContract("AdvancedONFT721")
    console.log(`[source] AdvancedONFT721.address: ${advancedONFT.address}`)

    // withdraw ETH from the contract to the beneficiary
    try {
        let tx = await (await advancedONFT.withdraw()).wait()
        console.log(`✅ [${hre.network.name}] withdraw`)
        console.log(` tx: ${tx.transactionHash}`)
    } catch (e) {
        console.log(e)
    }
}