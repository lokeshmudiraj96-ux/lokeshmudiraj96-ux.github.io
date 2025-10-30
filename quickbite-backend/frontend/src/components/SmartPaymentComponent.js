import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  Chip,
  Divider,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Avatar,
  IconButton,
  Tooltip,
  LinearProgress
} from '@mui/material';
import {
  CreditCard,
  AccountBalance,
  Phone,
  QrCode,
  Wallet,
  MonetizationOn,
  Security,
  Star,
  Add,
  Delete,
  Edit,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Info
} from '@mui/icons-material';

const SmartPaymentComponent = ({ 
  orderDetails, 
  onPaymentSuccess, 
  onPaymentFailure,
  userId 
}) => {
  const [selectedMethod, setSelectedMethod] = useState('UPI');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [savedMethods, setSavedMethods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [riskAssessment, setRiskAssessment] = useState(null);
  const [gatewayFees, setGatewayFees] = useState({});
  const [openUPIDialog, setOpenUPIDialog] = useState(false);
  const [upiVPA, setUpiVPA] = useState('');
  const [paymentStep, setPaymentStep] = useState(1); // 1: method, 2: processing, 3: result

  // Payment method configurations
  const paymentMethods = [
    {
      id: 'UPI',
      name: 'UPI',
      icon: <QrCode />,
      description: 'Pay using UPI (Instant & Free)',
      fee: 0,
      popular: true,
      providers: ['RAZORPAY', 'PHONEPE', 'PAYTM']
    },
    {
      id: 'CARD',
      name: 'Credit/Debit Card',
      icon: <CreditCard />,
      description: 'Visa, MasterCard, RuPay',
      fee: 2.0,
      popular: false,
      providers: ['RAZORPAY', 'PAYTM']
    },
    {
      id: 'WALLET',
      name: 'Digital Wallet',
      icon: <Wallet />,
      description: 'Paytm, PhonePe, Mobikwik',
      fee: 1.5,
      popular: false,
      providers: ['PAYTM', 'PHONEPE']
    },
    {
      id: 'NETBANKING',
      name: 'Net Banking',
      icon: <AccountBalance />,
      description: 'All major banks supported',
      fee: 1.9,
      popular: false,
      providers: ['RAZORPAY']
    },
    {
      id: 'BNPL',
      name: 'Buy Now Pay Later',
      icon: <MonetizationOn />,
      description: 'Pay in 15 or 30 days',
      fee: 0,
      popular: true,
      providers: ['SIMPL', 'LAZYPAY']
    },
    {
      id: 'COD',
      name: 'Cash on Delivery',
      icon: <Phone />,
      description: 'Pay when delivered',
      fee: 0,
      popular: false,
      providers: ['INTERNAL']
    }
  ];

  // Fetch saved payment methods
  useEffect(() => {
    const fetchSavedMethods = async () => {
      try {
        const response = await fetch(`/api/payments/users/${userId}/saved-methods`);
        const data = await response.json();
        if (data.success) {
          setSavedMethods(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch saved methods:', error);
      }
    };

    if (userId) {
      fetchSavedMethods();
    }
  }, [userId]);

  // Calculate fees for different gateways
  useEffect(() => {
    const calculateFees = () => {
      const fees = {};
      paymentMethods.forEach(method => {
        method.providers.forEach(provider => {
          const key = `${method.id}_${provider}`;
          const feeAmount = Math.round((orderDetails.total_amount_cents * method.fee) / 100);
          fees[key] = {
            percentage: method.fee,
            amount_cents: feeAmount,
            total_with_fee: orderDetails.total_amount_cents + feeAmount
          };
        });
      });
      setGatewayFees(fees);
    };

    if (orderDetails) {
      calculateFees();
    }
  }, [orderDetails]);

  // Assess payment risk
  const assessRisk = async (paymentData) => {
    try {
      const response = await fetch('/api/payments/risk-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
      });
      
      const data = await response.json();
      if (data.success) {
        setRiskAssessment(data.risk_assessment);
      }
    } catch (error) {
      console.error('Risk assessment failed:', error);
    }
  };

  // Handle payment method selection
  const handleMethodSelection = (method) => {
    setSelectedMethod(method);
    setError(null);
    
    // Auto-select best provider for the method
    const methodConfig = paymentMethods.find(m => m.id === method);
    if (methodConfig && methodConfig.providers.length > 0) {
      setSelectedProvider(methodConfig.providers[0]);
    }

    // Assess risk for the selected method
    assessRisk({
      method,
      amount_cents: orderDetails.total_amount_cents,
      user_id: userId
    });
  };

  // Process payment
  const processPayment = async () => {
    setProcessing(true);
    setError(null);
    setPaymentStep(2);

    try {
      const paymentData = {
        order_id: orderDetails.order_id,
        user_id: userId,
        restaurant_id: orderDetails.restaurant_id,
        method: selectedMethod,
        provider: selectedProvider,
        amount_cents: orderDetails.total_amount_cents,
        tax_amount_cents: orderDetails.tax_amount_cents || 0,
        delivery_fee_cents: orderDetails.delivery_fee_cents || 0,
        platform_fee_cents: orderDetails.platform_fee_cents || 0,
        discount_amount_cents: orderDetails.discount_amount_cents || 0
      };

      // Add method-specific details
      if (selectedMethod === 'UPI' && upiVPA) {
        paymentData.upi_details = { vpa: upiVPA, save_vpa: true };
      }

      const response = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
      });

      const result = await response.json();

      if (result.success) {
        // Handle different payment methods
        if (selectedMethod === 'COD') {
          setPaymentStep(3);
          onPaymentSuccess(result);
        } else if (result.gateway_response?.payment_url) {
          // Redirect to payment gateway
          window.location.href = result.gateway_response.payment_url;
        } else {
          setPaymentStep(3);
          onPaymentSuccess(result);
        }
      } else {
        throw new Error(result.message || 'Payment failed');
      }

    } catch (error) {
      setError(error.message);
      setPaymentStep(1);
      onPaymentFailure(error);
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (cents) => {
    return `₹${(cents / 100).toFixed(2)}`;
  };

  const getRiskColor = (score) => {
    if (score < 0.3) return 'success';
    if (score < 0.7) return 'warning';
    return 'error';
  };

  const getRiskText = (score) => {
    if (score < 0.3) return 'Low Risk';
    if (score < 0.7) return 'Medium Risk';
    return 'High Risk';
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Choose Payment Method
      </Typography>

      {/* Order Summary */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            Order Summary
          </Typography>
          <Box display="flex" justifyContent="space-between" mb={1}>
            <Typography>Subtotal:</Typography>
            <Typography>{formatCurrency(orderDetails.subtotal_cents || 0)}</Typography>
          </Box>
          <Box display="flex" justifyContent="space-between" mb={1}>
            <Typography>Delivery Fee:</Typography>
            <Typography>{formatCurrency(orderDetails.delivery_fee_cents || 0)}</Typography>
          </Box>
          <Box display="flex" justifyContent="space-between" mb={1}>
            <Typography>Tax:</Typography>
            <Typography>{formatCurrency(orderDetails.tax_amount_cents || 0)}</Typography>
          </Box>
          {orderDetails.discount_amount_cents > 0 && (
            <Box display="flex" justifyContent="space-between" mb={1}>
              <Typography color="success.main">Discount:</Typography>
              <Typography color="success.main">-{formatCurrency(orderDetails.discount_amount_cents)}</Typography>
            </Box>
          )}
          <Divider sx={{ my: 1 }} />
          <Box display="flex" justifyContent="space-between">
            <Typography variant="h6">Total:</Typography>
            <Typography variant="h6" color="primary">
              {formatCurrency(orderDetails.total_amount_cents)}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {paymentStep === 1 && (
        <>
          {/* Payment Methods */}
          <FormControl component="fieldset" fullWidth>
            <RadioGroup
              value={selectedMethod}
              onChange={(e) => handleMethodSelection(e.target.value)}
            >
              {paymentMethods.map((method) => (
                <Card key={method.id} sx={{ mb: 2, border: selectedMethod === method.id ? 2 : 1, borderColor: selectedMethod === method.id ? 'primary.main' : 'divider' }}>
                  <CardContent>
                    <FormControlLabel
                      value={method.id}
                      control={<Radio />}
                      label={
                        <Box display="flex" alignItems="center" width="100%" justifyContent="space-between">
                          <Box display="flex" alignItems="center" gap={2}>
                            <Avatar sx={{ bgcolor: 'primary.main' }}>
                              {method.icon}
                            </Avatar>
                            <Box>
                              <Box display="flex" alignItems="center" gap={1}>
                                <Typography variant="subtitle1">
                                  {method.name}
                                </Typography>
                                {method.popular && (
                                  <Chip size="small" label="Popular" color="primary" />
                                )}
                                {method.fee === 0 && (
                                  <Chip size="small" label="Free" color="success" />
                                )}
                              </Box>
                              <Typography variant="body2" color="text.secondary">
                                {method.description}
                              </Typography>
                              {method.fee > 0 && (
                                <Typography variant="caption" color="warning.main">
                                  Processing fee: {method.fee}%
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      }
                      sx={{ width: '100%', margin: 0 }}
                    />
                  </CardContent>
                </Card>
              ))}
            </RadioGroup>
          </FormControl>

          {/* Risk Assessment */}
          {riskAssessment && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <Security color="action" />
                  <Typography variant="subtitle1">Security Assessment</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={2}>
                  <LinearProgress 
                    variant="determinate" 
                    value={riskAssessment.risk_score * 100}
                    color={getRiskColor(riskAssessment.risk_score)}
                    sx={{ flexGrow: 1, height: 8, borderRadius: 1 }}
                  />
                  <Chip 
                    size="small"
                    label={getRiskText(riskAssessment.risk_score)}
                    color={getRiskColor(riskAssessment.risk_score)}
                  />
                </Box>
                {riskAssessment.fraud_flags && riskAssessment.fraud_flags.length > 0 && (
                  <Box mt={1}>
                    <Typography variant="caption" color="text.secondary">
                      Security flags: {riskAssessment.fraud_flags.join(', ')}
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* Saved Payment Methods */}
          {savedMethods.length > 0 && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  Saved Payment Methods
                </Typography>
                {savedMethods.map((method) => (
                  <Box key={method.id} display="flex" alignItems="center" justifyContent="space-between" p={1}>
                    <Box display="flex" alignItems="center" gap={2}>
                      <Avatar sx={{ bgcolor: 'grey.200', color: 'text.primary', width: 32, height: 32 }}>
                        {method.method_type === 'CARD' ? <CreditCard fontSize="small" /> : <QrCode fontSize="small" />}
                      </Avatar>
                      <Box>
                        <Typography variant="body2">
                          {method.nickname || `${method.method_type} ending in ${method.display_info.last4 || method.display_info.vpa}`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {method.provider}
                        </Typography>
                      </Box>
                      {method.is_default && (
                        <Chip size="small" label="Default" color="primary" />
                      )}
                    </Box>
                    <Box>
                      <IconButton size="small">
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error">
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Error Display */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Payment Button */}
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={selectedMethod === 'UPI' ? () => setOpenUPIDialog(true) : processPayment}
            disabled={!selectedMethod || processing}
            startIcon={processing ? <CircularProgress size={20} /> : <Security />}
            sx={{ mt: 2, py: 1.5 }}
          >
            {processing 
              ? 'Processing Payment...' 
              : `Pay ${formatCurrency(orderDetails.total_amount_cents)} Securely`
            }
          </Button>
        </>
      )}

      {paymentStep === 2 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={60} sx={{ mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Processing Payment
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Please wait while we process your payment...
            </Typography>
          </CardContent>
        </Card>
      )}

      {paymentStep === 3 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircle sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom color="success.main">
              Payment Successful!
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your order has been confirmed and is being processed.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* UPI Dialog */}
      <Dialog open={openUPIDialog} onClose={() => setOpenUPIDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={2}>
            <QrCode />
            UPI Payment
          </Box>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="UPI ID / VPA"
            placeholder="yourname@paytm / yourname@phonepe"
            value={upiVPA}
            onChange={(e) => setUpiVPA(e.target.value)}
            margin="normal"
            helperText="Enter your UPI ID to proceed with payment"
          />
          
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              You will be redirected to your UPI app to complete the payment.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenUPIDialog(false)}>Cancel</Button>
          <Button 
            variant="contained"
            onClick={() => {
              setOpenUPIDialog(false);
              processPayment();
            }}
            disabled={!upiVPA}
          >
            Proceed to Pay
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SmartPaymentComponent;