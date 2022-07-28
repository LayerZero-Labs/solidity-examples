module.exports = async function (taskArgs, hre) {
    const advancedONFT = await ethers.getContract("AdvancedONFT721")
    console.log(`[source] AdvancedONFT721.address: ${advancedONFT.address}`)

    // set new beneficiary for withdrawals and on-chain royalties
    try {
        let tx = await (await advancedONFT.setBeneficiary(taskArgs.beneficiary)).wait()
        console.log(`✅ [${hre.network.name}] setBeneficiary(${taskArgs.beneficiary})`)
        console.log(` tx: ${tx.transactionHash}`)
    } catch (e) {
        console.log(e)
    }
}