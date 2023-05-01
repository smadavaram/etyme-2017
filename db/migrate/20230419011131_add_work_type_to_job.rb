class AddWorkTypeToJob < ActiveRecord::Migration[5.2]
  def change
    add_column :jobs, :work_type, :integer, default: 0
    add_column :candidates, :work_type, :integer, default: 0
  end
end
