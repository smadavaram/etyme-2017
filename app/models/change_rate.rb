class ChangeRate < ApplicationRecord
  belongs_to :contract
  scope :get_date_range,		->(contract_id, type){ where(contract_id: contract_id, rate_type: type).pluck(:from_date, :to_date, :rate) }

  def self.rate(date, contract_id, type)
    rate = get_date_range(contract_id,type).map{|x| x[2] if date.between?(x[0], x[1])}.compact.first
  end
end
