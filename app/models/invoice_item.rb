class InvoiceItem < ApplicationRecord
  belongs_to :itemable, polymorphic: :true
  belongs_to :invoice
  
  after_create :update_timesheet_invoice, if: Proc.new {|item| item.invoice.timesheet_invoice?}
  after_create :update_expense_invoice, if: Proc.new {|item| item.invoice.client_expense_invoice?}
  
  def update_timesheet_invoice
    invoice.set_total_amount_hours
  end
  
  def update_expense_invoice
    invoice.update(total_amount: itemable.amount)
  end
  
end