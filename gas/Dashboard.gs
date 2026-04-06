// Dashboard aggregation

function getDashboard(dateStr) {
  var all = getAllProperties();
  var date = dateStr || new Date().toISOString().split('T')[0];

  var todayVisits = 0;
  var todayCreated = 0;
  var statusCounts = {};

  for (var i = 0; i < all.length; i++) {
    var p = all[i];

    // Count by status
    if (!statusCounts[p.status]) statusCounts[p.status] = 0;
    statusCounts[p.status]++;

    // Today's visits
    if (p.last_visit_date === date) {
      todayVisits++;
    }

    // Created today
    if (typeof p.created_at === 'string' && p.created_at.indexOf(date) === 0) {
      todayCreated++;
    }
  }

  return {
    date: date,
    totalPins: all.length,
    todayVisits: todayVisits,
    todayCreated: todayCreated,
    appointments: statusCounts['appointment'] || 0,
    contracts: statusCounts['contract'] || 0,
    statusCounts: statusCounts
  };
}
