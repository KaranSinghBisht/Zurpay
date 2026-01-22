use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, msg, pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.len() < 8 {
        msg!("Demo verifier: instruction data too short");
        return Err(solana_program::program_error::ProgramError::InvalidInstructionData);
    }

    let proof_len = u32::from_le_bytes(instruction_data[0..4].try_into().unwrap()) as usize;
    let expected_min_len = 4 + proof_len + 4;
    
    if instruction_data.len() < expected_min_len {
        msg!("Demo verifier: missing proof or public inputs");
        return Err(solana_program::program_error::ProgramError::InvalidInstructionData);
    }

    let inputs_offset = 4 + proof_len;
    let inputs_len = u32::from_le_bytes(instruction_data[inputs_offset..inputs_offset+4].try_into().unwrap()) as usize;
    
    if inputs_len != 192 {
        msg!("Demo verifier: expected 192 bytes public inputs, got {}", inputs_len);
        return Err(solana_program::program_error::ProgramError::InvalidInstructionData);
    }

    msg!("Demo verifier: proof accepted (DEMO MODE - NOT FOR PRODUCTION)");
    Ok(())
}
