class CreateClientExpenses < ActiveRecord::Migration[5.1]
  def change
    create_table :client_expenses do |t|

      t.integer     :job_id , index: true
      t.integer     :user_id
      t.integer     :company_id
      t.integer     :contract_id
      t.integer     :status  , default: 0
      t.float       :amount
      t.date        :start_date
      t.date        :end_date
      t.date        :submitted_date
      t.integer     :candidate_id
      t.integer     :ce_cycle_id
      t.integer     :ce_ap_cycle_id
      t.timestamps null: false
    end
  end
end
