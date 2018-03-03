class SellContract < ApplicationRecord

  belongs_to :contract, optional: true
  belongs_to :company, optional: true
  has_many :contract_sell_business_details
  has_many :sell_send_documents
  has_many :sell_request_documents
  has_many :contract_customer_rate_histories

  include NumberGenerator.new({prefix: 'SC', length: 7})

  accepts_nested_attributes_for :contract_sell_business_details, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :sell_send_documents, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :sell_request_documents, allow_destroy: true,reject_if: :all_blank

  after_create :set_contract_customer_rate_history
  after_update :set_contract_customer_rate_history, :if => proc { self.customer_rate_changed? }

  def set_contract_customer_rate_history
    self.contract_customer_rate_histories.create(customer_rate: self.customer_rate, change_date: Time.now)
  end

end
