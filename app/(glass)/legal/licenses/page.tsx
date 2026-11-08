import { LegalPage } from '@/components/LegalPage';
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
            <td>Up to 5</td>
          </tr>
          <tr>
            <td>Use for a client</td>
            <td>[CONFIRM]</td>
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
            <td>[N] months</td>
            <td>[N] months</td>
          </tr>
        </tbody>
      </table>
      <p>During the beta only the Standard licence can be requested. The Extended licence is available after beta, through a quotation.</p>
    </LegalPage>
  );
}
