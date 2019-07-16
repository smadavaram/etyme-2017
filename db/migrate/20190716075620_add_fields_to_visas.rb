class AddFieldsToVisas < ActiveRecord::Migration[5.1]
  def change
    add_column :visas, :visa_number, :string
    add_column :visas, :start_date, :date
  end
end
