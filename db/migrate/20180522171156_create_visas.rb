class CreateVisas < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :visas do |t|
      t.integer :candidate_id
      t.string :title
      t.string :file
      t.date :exp_date
      t.string :status

      t.timestamps
    end
  end
end
