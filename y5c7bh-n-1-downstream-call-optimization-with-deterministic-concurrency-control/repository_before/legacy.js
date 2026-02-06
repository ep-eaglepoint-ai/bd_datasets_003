async function fetchOwnerById(ownerId) { /* implemented elsewhere */ }
async function fetchTagsByCustomerId(customerId) { /* implemented elsewhere */ }
async function fetchOrdersByCustomerId(customerId) { /* implemented elsewhere */ }
async function fetchInvoiceById(invoiceId) { /* implemented elsewhere */ }

async function buildCustomerOverviews(customers) {
  const result = [];

  for (const c of customers) {
    let owner = null;
    try {
      owner = await fetchOwnerById(c.ownerId);
    } catch (e) {
      owner = null;
    }

    let tags = [];
    try {
      tags = await fetchTagsByCustomerId(c.id);
    } catch (e) {
      tags = [];
    }

    let orders = [];
    try {
      orders = await fetchOrdersByCustomerId(c.id);
    } catch (e) {
      orders = [];
    }

    let lastInvoice = null;
    if (c.lastInvoiceId) {
      try {
        lastInvoice = await fetchInvoiceById(c.lastInvoiceId);
      } catch (e) {
        lastInvoice = null;
      }
    }

    result.push({
      id: c.id,
      owner,
      tags,
      orders,
      lastInvoice
    });
  }

  return result;
}
