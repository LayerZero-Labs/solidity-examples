module.exports = async function (taskArgs, hre) {
    const advancedONFT = await ethers.getContract("AdvancedONFT721")
    console.log(`[source] AdvancedONFT721.address: ${advancedONFT.address}`)

    // publicMint() mint multiple ONFTs from a contract that has a public sale activated
    try {
        let tx = await (await advancedONFT.publicMint(taskArgs.quantity)).wait()
        console.log(`✅ [${hre.network.name}] publicMint(${taskArgs.quantity})`)
        console.log(` tx: ${tx.transactionHash}`)
    } catch (e) {
        console.log(e)
    }
}
