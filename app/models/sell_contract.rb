class SellContract < ApplicationRecord

  belongs_to :contract, optional: true
  belongs_to :company, optional: true
  has_many :contract_sell_business_details,dependent: :destroy

  has_many :document_signs, as: :initiator

  has_many :sell_send_documents,dependent: :destroy
  has_many :sell_request_documents,dependent: :destroy

  has_many :contract_customer_rate_histories,dependent: :destroy

  # include NumberGenerator.new({prefix: 'SC', length: 7})
  before_create :set_number

  accepts_nested_attributes_for :contract_sell_business_details, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :sell_send_documents, allow_destroy: true,reject_if: :all_blank
  accepts_nested_attributes_for :sell_request_documents, allow_destroy: true,reject_if: :all_blank

  after_create :set_contract_customer_rate_history
  after_update :set_contract_customer_rate_history, :if => proc { self.customer_rate_changed? }

  def set_contract_customer_rate_history
    self.contract_customer_rate_histories.create(customer_rate: self.customer_rate, change_date: Time.now)
  end

  def set_number
    # self.number = self.contract.number
    self.number = "SC_" + self.contract.number.split("_")[1].to_s
  end

  # def display_number
  #   "SC"+self.number
  # end

end
