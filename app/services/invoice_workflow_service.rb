# frozen_string_literal: true

class InvoiceWorkflowService
  def initialize(current_user, company)
    @current_user = current_user
    @company = company
  end

  def client_submit_invoice(timesheet_ids)
    timesheets = Timesheet.where(id: timesheet_ids)
    contract = timesheets.first.contract_cycle.contract

    invoice = contract.invoices.timesheet_invoice.open.new(
      submitted_by: @current_user,
      sender_company_id: @current_user.company.id,
      receiver_company_id: contract.sell_contract.company.id,
      total_amount: timesheets.sum(:amount),
      total_approve_time: timesheets.sum(:total_time),
      start_date: Date.today,
      end_date: Date.today + 1.month
    )

    if invoice.save
      timesheets.each do |ts|
        invoice.invoice_items.build(itemable: ts).save
      end
      { success: true, invoice: invoice }
    else
      { success: false, errors: invoice.errors.full_messages }
    end
  end

  def submit_invoice(invoice_id)
    invoice = Invoice.where(id: invoice_id).first
    if invoice.submitted!
      invoice.contract_cycle.completed!
      { success: true, message: 'Successfully Submitted' }
    else
      { success: false, errors: ['Unable to submit this Invoice.'] }
    end
  end

  def accept_invoice(invoice)
    if invoice.total_approve_time <= 0 || invoice.rate <= 0
      return { success: false, errors: ['Invoice not contains any amount.'] }
    end

    invoice.open!
    invoice.submitted_by = @current_user
    invoice.submitted_on = DateTime.now
    invoice.total_amount = (invoice.total_approve_time * invoice.rate)

    if invoice.save
      invoice.set_seq_accept_in
      { success: true, message: 'Successfully Submitted' }
    else
      { success: false, errors: ['You are Not authorized to Submit this Invoice.'] }
    end
  end

  def pay_invoice(invoice)
    if invoice.total_approve_time <= 0 || invoice.rate <= 0
      return { success: false, errors: ['Invoice not contains any amount.'] }
    end

    invoice.paid!
    if invoice.save
      invoice.set_seq_paid_in
      { success: true, message: 'Successfully Paid' }
    else
      { success: false, errors: ['You are Not authorized to Submit this Invoice.'] }
    end
  end

  def reject_invoice(invoice, contract)
    if contract.assignee == @current_user
      invoice.cancelled!
      invoice.submitted_by = @current_user
      invoice.submitted_on = DateTime.now
      if invoice.save
        { success: true, message: 'Successfully Cancelled' }
      else
        { success: false, errors: ['You are Not authorized to Cancel this Invoice.'] }
      end
    else
      { success: false, errors: ['Not authorized'] }
    end
  end

  def update_expense_invoice(invoice_id, expense_ids)
    invoice = Invoice.find(invoice_id)
    client_expenses = ClientExpense.where(id: expense_ids)

    if invoice.invoice_items.pluck(:itemable_id).include?(invoice_id)
      return { success: false, errors: ['Expense already exists.'] }
    end

    ClientExpense.transaction do
      client_expenses.each do |ce|
        invoice.invoice_items.build(itemable: ce).save
      end
      invoice.open! if invoice.pending_invoice?
    end
    { success: true, message: 'Updated Successfully' }
  end

  def set_invoice_timesheets(invoice)
    timesheets = invoice.contract.timesheets.approved_timesheets.where('start_date <= ? AND end_date <= ?', invoice.start_date, invoice.end_date)

    total_amount = 0
    total_approve_time = 0
    payrate = invoice.contract.sell_contract.today_rate.rate

    timesheets.each do |t|
      t.days.each_key do |k|
        if invoice.start_date <= k.to_date && invoice.end_date >= k.to_date
          total_amount += t.days[k].to_i * payrate
          total_approve_time += t.days[k].to_i
        end
      end
    end

    invoice.total_amount = total_amount
    invoice.total_approve_time = total_approve_time
    invoice.rate = payrate
    invoice.save

    { success: true, total_amount: total_amount, total_approve_time: total_approve_time }
  end
end
