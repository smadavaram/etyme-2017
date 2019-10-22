class BankDetail < ApplicationRecord

  belongs_to :company
    validates :bank_name, uniqueness: true
    validates :balance, presence: true
      validates :bank_name, presence: true

  # BANK_NAME = [ 'bank_of_america', 'texas_bank', 'wells_fargo' ]
enum bank_name: [ :bank_of_america, :texas_bank, :wells_fargo ]
  def init_ledger
    @ledger = Sequence::Client.new(
        ledger_name: 'bank-details',
        credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
  end

  def get_acc_balance
    init_ledger
    banks = []
    balance = Hash.new
    @ledger.keys.list.each do |key|
      banks << key.id if !['treasury', 'company'].include? key.id
    end

    banks.each do |bank|
      seq_balance = @ledger.actions.list({
        filter: 'flavor_id=$1 AND destination_account_id=$2 AND tags.bank=$3' ,
        filter_params: ['usd', 'balance', bank]
      }).page(size: 10)['items'].first
      balance[bank] = seq_balance.amount if seq_balance.present?
    end
    BankDetail.where(company_id: '10').each do |info|
      info.update(balance: balance[info.bank_name])
    end
  end


  def get_unidenfied_acc_balance
    init_ledger
    banks = []
    unidentified_bal = Hash.new
    @ledger.keys.list.each do |key|
      banks << key.id if !['treasury', 'company'].include? key.id
    end

    banks.each do |bank|
      seq_unidentidfied_bal = @ledger.actions.list({
        filter: 'flavor_id=$1 AND destination_account_id=$2 AND tags.bank=$3' ,
        filter_params: ['usd', 'unidentified_balance', bank]
      }).page(size: 10)['items'].first
      unidentified_bal[bank] = seq_unidentidfied_bal.amount if seq_unidentidfied_bal.present?
    end
    BankDetail.where(company_id: '10').each do |info|
      info.update(unidentified_bal: unidentified_bal[info.bank_name])
    end
  end


  def update_seq_bal(params)
    puts 'connecting to sequence'
    ledger = Sequence::Client.new(
        ledger_name: 'company-dev',
        credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )

    # create company account
    company_key = ledger.keys.query({aliases: [self.company.name]}).first
    unless company_key 
      company_key = ledger.keys.create(id: self.company.name)
    end

    
    ta = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["comp_#{self.company.id}_treasury"]).first

    treasury_account = ledger.accounts.create({
                                        keys: [company_key],
                                        quorum: 1,
                                        id: "comp_#{self.company.id}_treasury",
                                        tags: {
                                          name: self.company&.name.gsub(' ', '_') + '_treasury'
                                        }
                                     }) unless ta.present?

    ea = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["comp_#{self.company.id}_expense"]).first

    expense_account = ledger.accounts.create({
                                        keys: [company_key],
                                        quorum: 1,
                                        id: "comp_#{self.company.id}_expense",
                                        tags: {
                                          name: self.company&.name.gsub(' ', '_') + '_expense'
                                        }
                                     }) unless ea.present?

    ue = ledger.accounts.list(
        filter: 'id=$1',
        filter_params: ["comp_#{self.company.id}_unidentified_expense"]).first

    unidentified_account = ledger.accounts.create({
                                        keys: [company_key],
                                        quorum: 1,
                                        id: "comp_#{self.company.id}_unidentified_expense",
                                        tags: {
                                          name: self.company&.name.gsub(' ', '_') + '_unidentified_expense'
                                        }
                                     }) unless ue.present?


    sleep 1
    puts 'update start'
    ledger.transactions.transact do |builder|
      if params[:new_balance].to_i < params[:balance].to_i && params[:new_balance].to_i > 0
        builder.transfer(
          flavor_id: 'usd',
          amount: params[:unidentified_bal].to_i,
          source_account_id: 'comp_'+self.company_id.to_s+'_treasury',
          destination_account_id: 'comp_'+self.company_id.to_s+'_unidentified_expense',
          action_tags: {
            type: 'transfer',
            company: self.company.name,
            bank: params[:bank_name]
          }
        )
      else
        builder.issue(
          flavor_id: 'usd',
          amount: params[:balance].to_i,
          destination_account_id: 'comp_'+self.company_id.to_s+'_treasury',
          action_tags: {
            type: 'deposit',
            company: self.company.name,
            bank: params[:bank_name]
          }
        )
      end
    end
    puts 'update done'
  end

end
