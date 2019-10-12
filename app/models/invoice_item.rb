class InvoiceItem < ApplicationRecord
  belongs_to :itemable, polymorphic: :true
  belongs_to :invoice
  
  after_create :update_invoice
  
  def update_invoice
    invoice.set_total_amount_hours
  end
  
end