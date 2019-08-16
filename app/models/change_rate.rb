class ChangeRate < ApplicationRecord
  belongs_to :contract
  scope :get_date_range, ->(contract_id, type){ where(contract_id: contract_id, rate_type: type).pluck(:from_date, :to_date, :rate) }

  # scope :date_range, ->(date, contract_id, type) { get_date_range(contract_id,type).map{|x| x[2] if date.between?(x[0], x[1])}.compact.first }

  scope :sell_rates, -> {where(rate_type: 'sell').order(from_date: :asc)}
  scope :buy_rates, -> {where(rate_type: 'buy').order(from_date: :asc)}

  def self.date_range(date, contract_id, type)
    rate = self.get_date_range(contract_id,type).map{|x| x[2] if date.between?(x[0], x[1])}.compact.first
    rate.present? ? rate : where(rate_type: type,contract_id: contract_id).order(:from_date)&.first&.rate
  end

end
