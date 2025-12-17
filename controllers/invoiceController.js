import { Invoice } from '../models/Invoice.js';

export const createInvoice = async (req, res, next) => {
  try {
    const { items = [], tax = 0 } = req.body;
    const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);
    const total = subtotal + tax;
    const invoice = await Invoice.create({ ...req.body, subtotal, total });
    res.status(201).json(invoice);
  } catch (err) {
    next(err);
  }
};

export const listInvoices = async (req, res, next) => {
  try {
    const invoices = await Invoice.find().populate('guest').populate('reservation');
    res.json(invoices);
  } catch (err) {
    next(err);
  }
};

export const updateInvoiceStatus = async (req, res, next) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    if (!invoice) {
      res.status(404);
      throw new Error('Invoice not found');
    }
    res.json(invoice);
  } catch (err) {
    next(err);
  }
};


