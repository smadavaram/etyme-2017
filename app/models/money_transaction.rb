class MoneyTransaction < ApplicationRecord
  belongs_to :company
  belongs_to :contract
  belongs_to :part_of, polymorphic: true
  belongs_to :payable, polymorphic: true
end