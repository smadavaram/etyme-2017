class InvoiceItem < ApplicationRecord
  belongs_to :itemable, polymorphic: :true
  belongs_to :invoice
end