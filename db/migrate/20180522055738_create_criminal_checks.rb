class CreateCriminalChecks < ActiveRecord::Migration[5.1]
  def change
    create_table :criminal_checks do |t|
      t.integer :candidate_id
      t.string :state
      t.string :address
      t.date :start_date
      t.date :end_date

      t.timestamps
    end
  end
end
