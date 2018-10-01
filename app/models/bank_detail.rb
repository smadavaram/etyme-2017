class BankDetail < ApplicationRecord

  belongs_to :company

  BANK_NAME = [ 'bank_of_america', 'texas_bank', 'wells_fargo' ]


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


  def update_acc(params)
    puts 'connecting to sequence'
    init_ledger
    puts 'update start'
    update_seq_bal(params)
    update_seq_unidentified_bal(params)
    puts 'update done'
  end

  def update_seq_bal(params)
    @ledger.transactions.transact do |builder|
      builder.issue(
        flavor_id: 'usd',
        amount: params[:balance].to_i,
        destination_account_id: 'balance',
        action_tags: {
          type: 'deposit',
          company: 'cloudepa',
          bank: params[:bank_name]
        }
      )
    end
  end

  def update_seq_unidentified_bal(params)
    @ledger.transactions.transact do |builder|
      builder.issue(
        flavor_id: 'usd',
        amount: params[:unidentified_bal].to_i,
        destination_account_id: 'unidentified_balance',
        action_tags: {
          type: 'deposit',
          company: 'cloudepa',
          bank: params[:bank_name]
        }
      )
    end
  end

end
