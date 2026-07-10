import Foundation
import IOKit.ps

class PowerState {
    
    /// Returns true if the Mac is plugged into AC power (or if it's a desktop Mac without a battery).
    /// Returns false if it is running on battery power.
    static var isPluggedIn: Bool {
        let snapshot = IOPSCopyPowerSourcesInfo().takeRetainedValue()
        let sources = IOPSCopyPowerSourcesList(snapshot).takeRetainedValue() as Array
        
        for ps in sources {
            let info = IOPSGetPowerSourceDescription(snapshot, ps).takeUnretainedValue() as! [String: Any]
            
            // Check if the power source state is AC Power
            if let state = info[kIOPSPowerSourceStateKey] as? String {
                if state == kIOPSACPowerValue {
                    return true
                }
            }
        }
        
        // If the array is empty, it's likely a desktop Mac (Mac Mini, iMac, Mac Studio) which is always plugged in.
        // If it's a MacBook on battery, the loop will run and return false.
        if sources.isEmpty {
            return true
        }
        
        return false
    }
}
