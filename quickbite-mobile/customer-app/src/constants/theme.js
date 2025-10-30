import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

// Theme Colors
export const COLORS = {
  // Primary Colors
  primary: '#FF6B35',
  primaryDark: '#E55530',
  primaryLight: '#FF8A65',
  secondary: '#F7931E',
  accent: '#4CAF50',
  
  // Neutral Colors
  black: '#000000',
  darkGray: '#424242',
  gray: '#757575',
  lightGray: '#BDBDBD',
  lightGray2: '#EEEEEE',
  lightGray3: '#F5F5F5',
  white: '#FFFFFF',
  
  // Status Colors
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',
  
  // Functional Colors
  background: '#FAFAFA',
  surface: '#FFFFFF',
  onSurface: '#212121',
  onBackground: '#212121',
  
  // Food Category Colors
  vegetarian: '#4CAF50',
  nonVegetarian: '#F44336',
  vegan: '#8BC34A',
  
  // Rating Colors
  rating: '#FFC107',
  ratingBackground: '#F5F5F5',
  
  // Transparent Colors
  transparent: 'transparent',
  overlay: 'rgba(0, 0, 0, 0.5)',
  modalBackground: 'rgba(0, 0, 0, 0.6)',
  
  // Card Colors
  cardShadow: 'rgba(0, 0, 0, 0.1)',
  cardBackground: '#FFFFFF',
  
  // Border Colors
  borderColor: '#E0E0E0',
  inputBorder: '#E0E0E0',
  focusedBorder: '#FF6B35',
  
  // Text Colors
  textPrimary: '#212121',
  textSecondary: '#757575',
  textDisabled: '#BDBDBD',
  textWhite: '#FFFFFF',
  
  // Gradient Colors
  gradientStart: '#FF6B35',
  gradientEnd: '#F7931E',
};

// Font Sizes
export const SIZES = {
  // App Dimensions
  width,
  height,
  
  // Font sizes
  largeTitle: 40,
  h1: 30,
  h2: 22,
  h3: 20,
  h4: 18,
  body1: 16,
  body2: 14,
  body3: 12,
  body4: 10,
  caption: 12,
  
  // App specific sizes
  base: 8,
  font: 14,
  radius: 12,
  padding: 24,
  margin: 20,
  
  // Component specific sizes
  buttonHeight: 50,
  inputHeight: 48,
  cardRadius: 12,
  imageRadius: 8,
  avatarRadius: 25,
  
  // Navigation
  tabBarHeight: 70,
  headerHeight: 60,
  
  // Layout
  containerPadding: 20,
  screenPadding: 16,
  sectionMargin: 24,
  itemMargin: 12,
  
  // Icons
  iconSize: 24,
  smallIcon: 16,
  largeIcon: 32,
  
  // Spacing
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Font Weights and Families
export const FONTS = {
  largeTitle: {
    fontFamily: 'Roboto-Black',
    fontSize: SIZES.largeTitle,
    lineHeight: 55,
  },
  h1: {
    fontFamily: 'Roboto-Bold',
    fontSize: SIZES.h1,
    lineHeight: 36,
  },
  h2: {
    fontFamily: 'Roboto-Bold',
    fontSize: SIZES.h2,
    lineHeight: 30,
  },
  h3: {
    fontFamily: 'Roboto-Bold',
    fontSize: SIZES.h3,
    lineHeight: 22,
  },
  h4: {
    fontFamily: 'Roboto-Bold',
    fontSize: SIZES.h4,
    lineHeight: 22,
  },
  body1: {
    fontFamily: 'Roboto-Regular',
    fontSize: SIZES.body1,
    lineHeight: 22,
  },
  body2: {
    fontFamily: 'Roboto-Regular',
    fontSize: SIZES.body2,
    lineHeight: 22,
  },
  body3: {
    fontFamily: 'Roboto-Regular',
    fontSize: SIZES.body3,
    lineHeight: 18,
  },
  body4: {
    fontFamily: 'Roboto-Regular',
    fontSize: SIZES.body4,
    lineHeight: 18,
  },
  caption: {
    fontFamily: 'Roboto-Regular',
    fontSize: SIZES.caption,
    lineHeight: 16,
  },
  button: {
    fontFamily: 'Roboto-Medium',
    fontSize: SIZES.body2,
    lineHeight: 18,
  },
};

// Shadow Styles
export const SHADOWS = {
  light: {
    shadowColor: COLORS.black,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  medium: {
    shadowColor: COLORS.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  heavy: {
    shadowColor: COLORS.black,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 8,
  },
  card: {
    shadowColor: COLORS.black,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.20,
    shadowRadius: 1.41,
    elevation: 2,
  },
};

// Animation Durations
export const ANIMATIONS = {
  fast: 200,
  normal: 300,
  slow: 500,
  verySlow: 800,
};

// Common Styles
export const COMMON_STYLES = {
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  column: {
    flexDirection: 'column',
  },
  columnCenter: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shadow: SHADOWS.card,
  card: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: SIZES.cardRadius,
    padding: SIZES.padding,
    ...SHADOWS.card,
  },
  input: {
    height: SIZES.inputHeight,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: SIZES.radius,
    paddingHorizontal: SIZES.padding,
    backgroundColor: COLORS.white,
    ...FONTS.body2,
    color: COLORS.textPrimary,
  },
  button: {
    height: SIZES.buttonHeight,
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radius,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SIZES.padding,
  },
  buttonText: {
    ...FONTS.button,
    color: COLORS.white,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.lightGray2,
    marginVertical: SIZES.margin,
  },
};

// Screen Breakpoints
export const BREAKPOINTS = {
  xs: 375,
  sm: 768,
  md: 1024,
  lg: 1366,
  xl: 1920,
};

// Z-Index Values
export const Z_INDEX = {
  modal: 1000,
  overlay: 999,
  dropdown: 998,
  header: 997,
  bottomSheet: 996,
  fab: 995,
  toast: 994,
};

// Theme Object
const theme = {
  COLORS,
  SIZES,
  FONTS,
  SHADOWS,
  ANIMATIONS,
  COMMON_STYLES,
  BREAKPOINTS,
  Z_INDEX,
};

export default theme;