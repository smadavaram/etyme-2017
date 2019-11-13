class AddCcJobToContracts < ActiveRecord::Migration[5.1]
  def change
    add_column :contracts, :cc_job, :integer, default: 0
  end
end
