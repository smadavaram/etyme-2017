class AddFiledInJob < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :jobs, :price, :decimal
    add_column :jobs, :job_type, :string
  end
end
