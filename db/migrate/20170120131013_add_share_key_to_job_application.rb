class AddShareKeyToJobApplication < ActiveRecord::Migration[4.2]
  def change
    add_column :job_applications, :share_key, :string
  end
end
