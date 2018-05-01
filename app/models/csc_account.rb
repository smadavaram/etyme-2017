class CscAccount < ApplicationRecord
  belongs_to :contract_sale_commision, optional: true
  belongs_to :accountable, polymorphic: true, optional: true
end
