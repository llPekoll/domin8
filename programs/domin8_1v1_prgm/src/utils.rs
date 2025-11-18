use anchor_lang::prelude::*;

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
}
