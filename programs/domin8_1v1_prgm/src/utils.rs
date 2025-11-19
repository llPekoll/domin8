use anchor_lang::prelude::*;
use rust_decimal::Decimal;
use crate::error::Domin81v1Error;

/// Utility functions for the domin8_1v1 program
pub struct Utils;

impl Utils {
    /// Convert bytes array to hex string for display
    pub fn bytes_to_hex(bytes: &[u8; 32]) -> String {
        bytes
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<_>>()
            .join("")
    }

    /// Convert Switchboard randomness (Decimal) to a winner determination
    /// 
    /// Takes the integer part of the Decimal and uses modulo 2 to determine winner:
    /// - Even (0) → Player A wins
    /// - Odd (1) → Player B wins
    /// 
    /// @param randomness - Decimal value from Switchboard
    /// @return true if Player A wins, false if Player B wins
    pub fn determine_winner_from_randomness(randomness: Decimal) -> Result<bool> {
        // Convert Decimal to u64 for modulo operation
        // We use the integer part of the decimal value
        let randomness_int = randomness
            .to_u64()
            .ok_or(Domin81v1Error::RandomnessConversionError)?;

        // Use modulo 2 to determine winner
        // Even (0) = Player A wins (true)
        // Odd (1) = Player B wins (false)
        Ok(randomness_int % 2 == 0)
    }

    /// Alternative winner determination using the mantissa for better distribution
    /// This provides a more uniform distribution across the full randomness range
    /// 
    /// Takes the bytes representation of the Decimal and XORs the first 4 bytes
    /// then uses modulo 2 to determine winner
    pub fn determine_winner_from_randomness_xor(randomness: Decimal) -> Result<bool> {
        // Get the mantissa bytes from the Decimal
        let bits = randomness.to_bits();
        let bytes = bits.to_le_bytes();

        // XOR the first 4 bytes for better distribution
        let xor_result = bytes[0] ^ bytes[1] ^ bytes[2] ^ bytes[3];

        Ok(xor_result % 2 == 0)
    }
}
