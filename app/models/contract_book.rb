class ContractBook < ApplicationRecord
  
  enum transaction_type: [:salary]
  enum contract_type: [:sell_contract, :buy_contract]
  
  belongs_to :contract
  belongs_to :bookable, polymorphic: :true
  belongs_to :beneficiary, polymorphic: :true
  
  before_create :set_salary_remaining
  after_create :update_bank_balance
  
  def bank
    contract.company.bank_details.first
  end
  
  def self.get_total(contract, transaction_type, beneficiary)
    contract.contract_books.send(transaction_type).where(beneficiary: beneficiary).sum(:total)
  end
  
  def self.get_credit(contract, transaction_type, beneficiary)
    contract.contract_books.send(transaction_type).where(beneficiary: beneficiary).sum(:paid)
  end

  def is_first?
    contract.contract_books.send(self.transaction_type).where(beneficiary: beneficiary).count == 1
  end

  private
    
    def set_salary_remaining
      total = self.class.get_total(contract, transaction_type, beneficiary)
      total_credit = self.class.get_credit(contract, transaction_type, beneficiary)
      self.previous = total - total_credit
      self.remainings = (self.previous + self.total) - self.paid
    end
    
    def update_bank_balance
      bank.decrement!(:balance, by = paid)
    end

end