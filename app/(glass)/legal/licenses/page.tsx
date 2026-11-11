import { LegalPage } from '@/components/LegalPage';
import { LICENCE_UPDATE_MONTHS } from '@/lib/config';
import { pageMetadata } from '@/lib/seo/pageMeta';

export const generateMetadata = () => pageMetadata('/licenses', { alternates: { canonical: '/legal/licenses' } });

export default function Licenses() {
  return (
    <LegalPage path="/licenses">
      <p>Every website is sold with a licence, not ownership of the seller&apos;s copyright. Others may buy the same website.</p>
      <table>
        <thead>
          <tr>
            <th scope="col">What you can do</th>
            <th scope="col">Standard</th>
            <th scope="col">Extended</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Launch websites</td>
            <td>1</td>
            <td>More than one, as set in your quotation</td>
          </tr>
          <tr>
            <td>Build one end website for one client</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Build websites for several clients</td>
            <td>No</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Resell finished websites built from it</td>
            <td>No</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Use it in a SaaS or paid product for many users</td>
            <td>No</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Change the code and design</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Resell or share the source code</td>
            <td>No</td>
            <td>No</td>
          </tr>
          <tr>
            <td>Updates from the seller</td>
            <td>{LICENCE_UPDATE_MONTHS.standard} months</td>
            <td>{LICENCE_UPDATE_MONTHS.extended} months</td>
          </tr>
        </tbody>
      </table>
      <p>
        The Standard licence covers one end website, for yourself or for one client. Several clients, reselling finished websites, or SaaS use need the Extended licence. Neither licence lets you
        resell or share the source code itself, as a starter kit or copy. A digital product states its own support and update period on its listing, and that period applies to it.
      </p>
      <p>During the beta only the Standard licence can be requested. The Extended licence is available after beta, through a quotation.</p>
    </LegalPage>
  );
}
