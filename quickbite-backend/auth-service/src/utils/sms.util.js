// SMS utility for sending OTPs
// You can integrate with AWS SNS, Twilio, or any SMS provider

const sendOTP = async (phone, otpCode) => {
  try {
    // TODO: Integrate with your SMS provider
    // Example with AWS SNS:
    /*
    const AWS = require('aws-sdk');
    const sns = new AWS.SNS({ region: process.env.AWS_REGION });
    
    const params = {
      Message: `Your OTP is: ${otpCode}. Valid for 10 minutes.`,
      PhoneNumber: phone,
      MessageAttributes: {
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String',
          StringValue: 'YourApp'
        },
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional'
        }
      }
    };
    
    await sns.publish(params).promise();
    */

    // For development, just log the OTP
    if (process.env.NODE_ENV === 'development') {
      console.log(`📱 OTP for ${phone}: ${otpCode}`);
      return true;
    }

    // Production: throw error if SMS provider not configured
    throw new Error('SMS provider not configured');
  } catch (error) {
    console.error('Error sending OTP:', error);
    throw new Error('Failed to send OTP');
  }
};

module.exports = { sendOTP };
