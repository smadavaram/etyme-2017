class BuyContract < ApplicationRecord

  belongs_to :contract, optional: true
  has_many :contract_buy_business_details
  has_many :contract_sale_commisions
  include NumberGenerator.new({prefix: 'BC', length: 7})

  accepts_nested_attributes_for :contract_buy_business_details, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :contract_sale_commisions, allow_destroy: true,reject_if: :all_blank

end
