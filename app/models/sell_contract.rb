class SellContract < ApplicationRecord

  belongs_to :contract, optional: true
  has_many :contract_sell_business_details
  has_many :sell_send_documents
  has_many :sell_request_documents

  include NumberGenerator.new({prefix: 'SC', length: 7})

  accepts_nested_attributes_for :contract_sell_business_details, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :sell_send_documents, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :sell_request_documents, allow_destroy: true,reject_if: :all_blank

end
