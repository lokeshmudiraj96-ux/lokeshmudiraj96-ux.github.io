import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  Chip,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  CircularProgress,
  Tooltip
} from '@mui/material';
import {
  Restaurant as RestaurantIcon,
  TrendingUp,
  Warning,
  Inventory,
  Analytics,
  Schedule,
  LocalOffer,
  Refresh,
  Add,
  Edit,
  Visibility,
  VisibilityOff
} from '@mui/icons-material';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  ArcElement
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  ChartTooltip,
  Legend,
  ArcElement
);

const RestaurantDashboard = ({ restaurantId }) => {
  const [restaurant, setRestaurant] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [openDialog, setOpenDialog] = useState(null);
  const [bulkUpdateItems, setBulkUpdateItems] = useState([]);

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/catalog/restaurants/${restaurantId}/dashboard`);
      const data = await response.json();
      
      if (data.success) {
        setRestaurant(data.data.restaurant);
        setDashboardData(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Toggle restaurant operating status
  const toggleOperatingStatus = async () => {
    try {
      const response = await fetch(`/api/catalog/restaurants/${restaurantId}/operating-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_open: !restaurant.is_open })
      });
      
      if (response.ok) {
        setRestaurant(prev => ({ ...prev, is_open: !prev.is_open }));
      }
    } catch (error) {
      console.error('Failed to update operating status:', error);
    }
  };

  useEffect(() => {
    if (restaurantId) {
      fetchDashboardData();
      // Refresh data every 30 seconds
      const interval = setInterval(fetchDashboardData, 30000);
      return () => clearInterval(interval);
    }
  }, [restaurantId]);

  const formatCurrency = (cents) => {
    return `₹${(cents / 100).toFixed(2)}`;
  };

  const formatPercentage = (value) => {
    return `${value.toFixed(1)}%`;
  };

  // Summary cards data
  const summaryCards = [
    {
      title: 'Total Revenue',
      value: formatCurrency(dashboardData?.summary?.total_revenue_cents || 0),
      icon: <TrendingUp color="primary" />,
      color: 'primary.main'
    },
    {
      title: 'Total Orders',
      value: dashboardData?.summary?.total_orders || 0,
      icon: <RestaurantIcon color="success" />,
      color: 'success.main'
    },
    {
      title: 'Avg Order Value',
      value: formatCurrency(dashboardData?.summary?.average_order_value_cents || 0),
      icon: <Analytics color="info" />,
      color: 'info.main'
    },
    {
      title: 'Low Stock Alerts',
      value: dashboardData?.summary?.low_stock_alerts || 0,
      icon: <Warning color="warning" />,
      color: 'warning.main'
    }
  ];

  // Chart data for revenue analytics
  const revenueChartData = {
    labels: dashboardData?.menu_analytics?.map(cat => cat.category_name) || [],
    datasets: [{
      label: 'Revenue by Category',
      data: dashboardData?.menu_analytics?.map(cat => cat.total_revenue_cents / 100) || [],
      backgroundColor: [
        'rgba(54, 162, 235, 0.6)',
        'rgba(255, 99, 132, 0.6)', 
        'rgba(255, 205, 86, 0.6)',
        'rgba(75, 192, 192, 0.6)',
        'rgba(153, 102, 255, 0.6)'
      ],
      borderColor: [
        'rgba(54, 162, 235, 1)',
        'rgba(255, 99, 132, 1)',
        'rgba(255, 205, 86, 1)',
        'rgba(75, 192, 192, 1)',
        'rgba(153, 102, 255, 1)'
      ],
      borderWidth: 1
    }]
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box p={3}>
      {/* Header */}
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="h4" gutterBottom>
            {restaurant?.name} Dashboard
          </Typography>
          <Box display="flex" alignItems="center" gap={2}>
            <Chip 
              label={restaurant?.is_open ? 'Open' : 'Closed'} 
              color={restaurant?.is_open ? 'success' : 'error'} 
            />
            <Chip label={`Rating: ${restaurant?.average_rating || 0}/5`} variant="outlined" />
            <Chip label={`${restaurant?.total_reviews || 0} Reviews`} variant="outlined" />
          </Box>
        </Box>
        
        <Box display="flex" gap={2}>
          <FormControlLabel
            control={
              <Switch 
                checked={restaurant?.is_open || false} 
                onChange={toggleOperatingStatus}
                color="primary"
              />
            }
            label="Restaurant Open"
          />
          <Button 
            startIcon={<Refresh />} 
            onClick={fetchDashboardData}
            variant="outlined"
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={3}>
        {summaryCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom variant="body2">
                      {card.title}
                    </Typography>
                    <Typography variant="h5" component="div">
                      {card.value}
                    </Typography>
                  </Box>
                  <Box sx={{ color: card.color }}>
                    {card.icon}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Tabs */}
      <Card>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label="Analytics" />
          <Tab label="Popular Items" />
          <Tab label="Inventory Alerts" />
          <Tab label="Menu Management" />
        </Tabs>

        {/* Analytics Tab */}
        {activeTab === 0 && (
          <Box p={3}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Revenue by Category</Typography>
                <Bar 
                  data={revenueChartData}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: false },
                      title: { display: false }
                    }
                  }}
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Category Performance</Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Category</TableCell>
                        <TableCell align="right">Items</TableCell>
                        <TableCell align="right">Orders</TableCell>
                        <TableCell align="right">Revenue</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dashboardData?.menu_analytics?.map((category) => (
                        <TableRow key={category.category_id}>
                          <TableCell>{category.category_name}</TableCell>
                          <TableCell align="right">{category.available_items}/{category.total_items}</TableCell>
                          <TableCell align="right">{category.total_orders}</TableCell>
                          <TableCell align="right">{formatCurrency(category.total_revenue_cents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Popular Items Tab */}
        {activeTab === 1 && (
          <Box p={3}>
            <Typography variant="h6" gutterBottom>Most Popular Items</Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Item Name</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Recent Orders</TableCell>
                    <TableCell align="right">Total Quantity</TableCell>
                    <TableCell align="right">Avg Selling Price</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dashboardData?.popular_items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          {item.image_url && (
                            <Box
                              component="img"
                              src={item.image_url}
                              alt={item.name}
                              sx={{ width: 40, height: 40, borderRadius: 1 }}
                            />
                          )}
                          {item.name}
                        </Box>
                      </TableCell>
                      <TableCell align="right">{formatCurrency(item.base_price_cents)}</TableCell>
                      <TableCell align="right">{item.recent_orders || 0}</TableCell>
                      <TableCell align="right">{item.recent_quantity || 0}</TableCell>
                      <TableCell align="right">{formatCurrency(item.avg_selling_price || item.base_price_cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Inventory Alerts Tab */}
        {activeTab === 2 && (
          <Box p={3}>
            <Typography variant="h6" gutterBottom>Low Stock Alerts</Typography>
            {dashboardData?.low_stock_alerts?.length === 0 ? (
              <Alert severity="success">No low stock alerts! All items are well stocked.</Alert>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Item Name</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">Current Stock</TableCell>
                      <TableCell align="right">Daily Limit</TableCell>
                      <TableCell align="right">Sold Today</TableCell>
                      <TableCell>Alert Type</TableCell>
                      <TableCell align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dashboardData?.low_stock_alerts?.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell>{alert.name}</TableCell>
                        <TableCell>{alert.category_name}</TableCell>
                        <TableCell align="right">{alert.stock_quantity || 'Unlimited'}</TableCell>
                        <TableCell align="right">{alert.daily_limit || 'No Limit'}</TableCell>
                        <TableCell align="right">{alert.sold_today || 0}</TableCell>
                        <TableCell>
                          <Chip 
                            size="small"
                            label={alert.alert_type === 'low_stock' ? 'Low Stock' : 'Daily Limit'} 
                            color={alert.alert_type === 'low_stock' ? 'error' : 'warning'}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Button size="small" startIcon={<Add />}>
                            Restock
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* Menu Management Tab */}
        {activeTab === 3 && (
          <Box p={3}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Menu Management</Typography>
              <Box display="flex" gap={2}>
                <Button startIcon={<Add />} variant="contained">
                  Add Item
                </Button>
                <Button startIcon={<Edit />} variant="outlined">
                  Edit Categories
                </Button>
              </Box>
            </Box>

            {dashboardData?.menu_analytics?.map((category) => (
              <Card key={category.category_id} sx={{ mb: 2 }}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6">{category.category_name}</Typography>
                    <Box display="flex" alignItems="center" gap={2}>
                      <Chip 
                        size="small" 
                        label={`${category.available_items}/${category.total_items} available`}
                        color={category.available_items === category.total_items ? 'success' : 'warning'}
                      />
                      <Button size="small" startIcon={<Add />}>
                        Add Item
                      </Button>
                    </Box>
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary">
                    Total Orders: {category.total_orders} | 
                    Revenue: {formatCurrency(category.total_revenue_cents)} | 
                    Avg Popularity: {category.avg_popularity_score?.toFixed(1) || 0}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Card>
    </Box>
  );
};

export default RestaurantDashboard;