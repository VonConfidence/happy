import { Dimensions, Platform, type DimensionValue } from 'react-native';
import { getDeviceType } from '@/utils/responsive';
import { isRunningOnMac } from '@/utils/platform';

const LARGE_DESKTOP_BREAKPOINT = 1600;

function shouldUseFullWidthOnLargeDesktop(): boolean {
    if (Platform.OS !== 'web' && !isRunningOnMac()) {
        return false;
    }

    const { width } = Dimensions.get('window');
    return width >= LARGE_DESKTOP_BREAKPOINT;
}

// Calculate max width based on device type
function getMaxWidth(): DimensionValue {
    const deviceType = getDeviceType();
    
    // For phones, use the max dimension (width or height)
    if (deviceType === 'phone' && Platform.OS !== 'web') {
        const { width, height } = Dimensions.get('window');
        return Math.max(width, height);
    }

    if (shouldUseFullWidthOnLargeDesktop()) {
        return '100%';
    }

    if (isRunningOnMac()) {
        return Number.POSITIVE_INFINITY;
    }
    
    // For tablets and web, use 700px
    return 800;
}

// Calculate max width based on device type
function getMaxLayoutWidth(): DimensionValue {
    const deviceType = getDeviceType();
    
    // For phones, use the max dimension (width or height)
    if (deviceType === 'phone' && Platform.OS !== 'web') {
        const { width, height } = Dimensions.get('window');
        return Math.max(width, height);
    }

    if (shouldUseFullWidthOnLargeDesktop()) {
        return '100%';
    }

    if (isRunningOnMac()) {
        return 1400;
    }
    
    // For tablets and web, use 700px
    return 800;
}

export const layout = {
    maxWidth: getMaxLayoutWidth(),
    headerMaxWidth: getMaxWidth()
}
