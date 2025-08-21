class CreateHolidays < ActiveRecord::Migration[5.1]
  def change
    create_table :holidays do |t|
      t.datetime :date
      t.string :name
      t.bigint :company_id

      t.timestamps
    end
  end
end
