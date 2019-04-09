class AddColumnMediaTypeToJobs < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :jobs, :media_type, :string
  end
end
