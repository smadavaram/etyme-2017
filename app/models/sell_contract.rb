class SellContract < ApplicationRecord
  
  belongs_to :contract, optional: true
  belongs_to :company, optional: true
  has_many :contract_sell_business_details, dependent: :destroy

  has_many :document_signs, as: :initiator
  has_many :document_signs, as: :part_of
  
  has_many :sell_send_documents, dependent: :destroy
  has_many :sell_request_documents, dependent: :destroy
  
  has_many :contract_customer_rate_histories, dependent: :destroy
  
  has_many :approvals, as: :contractable, dependent: :destroy
  
  has_one :conversation
  has_many :change_rates, as: :rateable, dependent: :destroy
  has_many :contract_cycles, as: :cycle_of
  has_many :contract_admins,as: :admin_able


  # include NumberGenerator.new({prefix: 'SC', length: 7})
  before_create :set_number
  after_create :create_sell_contract_conversation
  
  accepts_nested_attributes_for :contract_sell_business_details, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :sell_send_documents, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :sell_request_documents, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :approvals, allow_destroy: true, reject_if: :all_blank
  accepts_nested_attributes_for :change_rates, allow_destroy: true, reject_if: proc { |attributes|attributes['rate'].blank? || attributes['working_hrs'].blank? ||attributes['working_hrs'].blank? ||attributes['rate_type'].blank? || attributes['from_date'].blank? || attributes['to_date'].blank? }
  
  after_create :set_contract_customer_rate_history
  after_update :set_contract_customer_rate_history, :if => proc { self.customer_rate_changed? }

  def set_contract_customer_rate_history
    self.contract_customer_rate_histories.create(customer_rate: self.customer_rate, change_date: Time.now)
  end
  
  def set_number
    # self.number = self.contract.number
    self.number = "SC_" + self.contract.number.split("_")[1].to_s
  end
  
  def create_sell_contract_conversation
    group = nil
    Group.transaction do
      group = contract.company.groups.create(group_name: number, member_type: 'Chat')
      groupies = User.where(id: contract.contract_admins.pluck(:user_id)).to_a + User.where(id: self.contract_sell_business_details.pluck(:user_id)).to_a
      groupies << contract.created_by
      groupies.uniq.each do |user|
        group.groupables.create(groupable: user)
      end
    end
    build_conversation({chatable: group, topic: :SellContract}).save if group
  end
  
  def get_rate(date)
    rate_on(date)
  end
  
  def today_rate
    rate_on(Date.today)
  end

  def count_contract_bussiness_details
    self.contract_sell_business_details.count
  end
  def count_contract_admin
    self.contract_admins.admin.count
  end
  
  def team_admin
    contract_admins.admin&.user || company.owner
  end

  
  
  private
   
    def rate_on(date)
      rate = change_rates.where("? between from_date and to_date", date).order(:from_date).first
      rate.present? ? rate : change_rates.all.order(:from_date).first
    end

end
