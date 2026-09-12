# frozen_string_literal: true

class SeqTimesheet
  include ActiveModel::Validations
  include ActiveModel::Conversion
  extend ActiveModel::Naming

  attr_accessor :contract_id, :company_id, :candidate_id, :date, :time, :created_at, :amount

  validates_presence_of :contract_id, :company_id, :candidate_id, :date, :time, :amount

  def initialize(attributes = {})
    attributes.each do |name, value|
      send("#{name}=", value)
    end
  end

  def create
    ledger = Sequence::Client.new(
      ledger_name: ENV['seq_ledgers'],
      credential: ENV['seq_token']
    )
    key = ledger.keys.query(ids: ['timesheet']).first

    ledger.accounts.create(
      alias: "tmsht1001_#{Time.now.to_i}",
      keys: [key],
      quorum: 1,
      tags: {
        contract_id: contract_id,
        company_id: company_id,
        candidate_id: candidate_id,
        time: time,
        date: date,
        amount: amount,
        created_at: Time.now
      }
    )

    # tx = ledger.transactions.transact do |builder|
    #   builder.issue(
    #       flavor_id: 'minutes',
    #       amount: 2400,
    #       destination_account_id: 'company3'
    #   )
    #   builder.issue( flavor_id: 'USD',
    #                  amount: 4800,
    #                  destination_account_id: 'company1'
    #   )
    # end
  end

  def get_all
    ledger = Sequence::Client.new(
      ledger_name: ENV['seq_ledgers'],
      credential: ENV['seq_token']
    )
    key = ledger.keys.query(ids: ['timesheet']).first

    timesheets = []
    ledger.accounts.query(filter: "key_ids=['timesheet']").each do |t|
      timesheets.push(t.to_json)
    end
    timesheets
  end
end
